import { supabase } from "@/lib/supabaseClient";
import { v4 as uuidv4 } from "uuid";

const RIP_BUCKET = "matrix-attachments";
const DOCS_BUCKET = "attachments";

export type UploadResult = {
  eventId: string;
  url: string;
  fileName: string;
  contentType: string;
};

export async function uploadAttachment(matrixId: string, file: File): Promise<UploadResult> {
  // 1) Upload para o Storage
  const normalizedName = file.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const safeFileName = normalizedName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `matrices/${matrixId}/${Date.now()}_${safeFileName}`;
  const { error: upErr } = await supabase.storage
    .from(RIP_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });
  if (upErr) throw upErr;

  const { data: pub } = supabase.storage.from(RIP_BUCKET).getPublicUrl(path);
  const url = pub?.publicUrl || "";

  // 2) Criar evento de anexo
  const today = new Date().toISOString().split("T")[0];
  const eventId = uuidv4();
  const { error: evErr } = await supabase
    .from("events")
    .insert({
      id: eventId,
      matrix_id: matrixId,
      date: today,
      type: "Relatório Final – Anexo",
      comment: file.name,
      location: "Relatório Final",
    });
  if (evErr) throw evErr;

  // 3) Vincular arquivo (se tabela existir)
  try {
    const { error: linkErr } = await supabase
      .from("event_files")
      .insert({ event_id: eventId, url, file_name: file.name, mime_type: file.type, file_size: file.size });
    if (linkErr) {
      // Não falhar se a tabela não existir; apenas prosseguir com o evento
      // console.warn("Falha ao vincular arquivo a event_files:", linkErr);
    }
  } catch (_) {
    // Ignora erro de tabela ausente
  }

  return { eventId, url, fileName: file.name, contentType: file.type };
}

export type FinalReportAttachments = {
  docsProjetos: Array<{
    id: string;
    url: string;
    file_name: string;
    mime_type: string;
    file_size: number;
  }>;
  rip: Array<{
    event_id: string;
    id: string;
    url: string;
    file_name: string;
    mime_type: string;
    file_size: number;
  }>;
};

async function listRipAttachments(matrixId: string) {
  try {
    // Fallback: buscar eventos de "Relatório Final – Anexo" diretamente
    const { data: events, error: evError } = await supabase
      .from("events")
      .select("id, comment, date")
      .eq("matrix_id", matrixId)
      .ilike("type", "%Relatório Final%Anexo%")
      .order("date", { ascending: false });
    
    if (evError) {
      console.error("Erro ao listar anexos RIP:", evError);
      return [];
    }
    
    // Retornar eventos como anexos (sem URL, apenas metadados)
    return (events || []).map((ev: any) => ({
      event_id: ev.id,
      id: ev.id,
      url: "",
      file_name: ev.comment || "Anexo",
      mime_type: "application/pdf",
      file_size: 0,
    }));
  } catch (err) {
    console.error("Erro ao listar anexos RIP:", err);
    return [];
  }
}

async function listDocsProjetos(matrixId: string) {
  try {
    const prefix = `matrices/${matrixId}`;
    const { data, error } = await supabase.storage
      .from(DOCS_BUCKET)
      .list(prefix, { limit: 100, offset: 0 });
    if (error) throw error;
    if (!data) return [];
    return data
      .filter((item) => item.name && !item.name.endsWith("/"))
      .map((item) => {
        const filePath = `${prefix}/${item.name}`;
        const { data: publicData } = supabase.storage.from(DOCS_BUCKET).getPublicUrl(filePath);
        return {
          id: `${DOCS_BUCKET}/${filePath}`,
          url: publicData?.publicUrl ?? "",
          file_name: item.name,
          mime_type: item.metadata?.mimetype || "",
          file_size: item.metadata?.size || 0,
        };
      });
  } catch (err) {
    console.error("Erro ao listar anexos Docs Projetos:", err);
    return [];
  }
}

export async function listAttachments(matrixId: string): Promise<FinalReportAttachments> {
  const [rip, docsProjetos] = await Promise.all([
    listRipAttachments(matrixId),
    listDocsProjetos(matrixId),
  ]);
  return { rip, docsProjetos };
}

export async function renameAttachment(eventFileId: string, newName: string) {
  const trimmed = newName.trim();
  if (!trimmed) throw new Error("Nome inválido");

  const { data, error } = await supabase
    .from("event_files")
    .update({ file_name: trimmed })
    .eq("id", eventFileId)
    .select("event_id")
    .single();
  if (error) throw error;

  const eventId = data?.event_id;
  if (eventId) {
    const { error: eventError } = await supabase
      .from("events")
      .update({ comment: trimmed })
      .eq("id", eventId);
    if (eventError) throw eventError;
  }
}

export async function deleteAttachment(eventFileId: string, fileUrl: string) {
  try {
    // Se não tem URL, é um anexo de evento - deletar o evento
    if (!fileUrl || fileUrl === "") {
      const { error: eventError } = await supabase
        .from("events")
        .delete()
        .eq("id", eventFileId);
      if (eventError) throw eventError;
      return;
    }

    // Se tem URL, deletar do storage e da tabela event_files
    const marker = `/storage/v1/object/public/${RIP_BUCKET}/`;
    const path = fileUrl.includes(marker) ? fileUrl.split(marker)[1] : "";

    if (path) {
      const { error: storageError } = await supabase.storage.from(RIP_BUCKET).remove([path]);
      if (storageError) throw storageError;
    }

    const { error: dbError } = await supabase.from("event_files").delete().eq("id", eventFileId);
    if (dbError) throw dbError;
  } catch (error) {
    throw error;
  }
}
