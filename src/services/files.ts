import { supabase } from "@/lib/supabaseClient";
import { v4 as uuidv4 } from "uuid";

const BUCKET = "matrix-attachments";

export type UploadResult = {
  eventId: string;
  url: string;
  fileName: string;
  contentType: string;
};

export async function uploadAttachment(matrixId: string, file: File): Promise<UploadResult> {
  // 1) Upload para o Storage
  const path = `matrices/${matrixId}/${Date.now()}_${file.name}`;
  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });
  if (upErr) throw upErr;

  const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
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

export async function listAttachments(matrixId: string) {
  // Tenta buscar via join em event_files; se falhar, retorna eventos do tipo anexo
  try {
    const { data, error } = await supabase
      .from("events")
      .select("id, date, type, comment, event_files(id, url, file_name, mime_type, file_size)")
      .eq("matrix_id", matrixId)
      .ilike("type", "%Relatório Final%")
      .order("date", { ascending: false });
    if (error) throw error;
    return data || [];
  } catch (e) {
    const { data, error } = await supabase
      .from("events")
      .select("id, date, type, comment")
      .eq("matrix_id", matrixId)
      .ilike("type", "%Relatório Final%")
      .order("date", { ascending: false });
    if (error) throw error;
    return data || [];
  }
}

export async function deleteAttachment(eventFileId: string) {
  // Deleta somente o vínculo; manter arquivo em storage é opcional
  const { error } = await supabase.from("event_files").delete().eq("id", eventFileId);
  if (error) throw error;
}
