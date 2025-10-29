import { supabase } from "@/lib/supabaseClient";

export type AnalysisCategory = "producao" | "carteira" | "ferramentas" | "correcoes";

export interface AnalysisExcelUpload {
  id: string;
  category: AnalysisCategory;
  storage_path: string;
  file_name: string;
  file_size: number;
  mime_type: string | null;
  uploaded_by: string | null;
  uploaded_at: string;
  updated_at: string;
  checksum: string | null;
  public_url: string | null;
  has_header: boolean;
  header_row: number;
}

const ANALYSIS_BUCKET = "attachments";
const ANALYSIS_PREFIX = "analysis";

const sanitizeFileName = (name: string): string => {
  const normalized = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return normalized.replace(/[^a-zA-Z0-9._-]/g, "_");
};

const buildStoragePath = (category: AnalysisCategory, fileName: string) => {
  const safeName = sanitizeFileName(fileName);
  return `${ANALYSIS_PREFIX}/${category}/${Date.now()}_${safeName}`;
};

const toUpload = (record: any): AnalysisExcelUpload => {
  const { data: publicData } = supabase.storage
    .from(ANALYSIS_BUCKET)
    .getPublicUrl(record.storage_path);

  return {
    id: record.id,
    category: record.category,
    storage_path: record.storage_path,
    file_name: record.file_name,
    file_size: record.file_size,
    mime_type: record.mime_type,
    uploaded_by: record.uploaded_by,
    uploaded_at: record.uploaded_at,
    updated_at: record.updated_at,
    checksum: record.checksum,
    public_url: publicData?.publicUrl ?? null,
    has_header: record.has_header ?? true,
    header_row: record.header_row ?? 1,
  };
};

export async function listAnalysisExcelUploads(): Promise<AnalysisExcelUpload[]> {
  const { data, error } = await supabase
    .from("analysis_excel_uploads")
    .select("*")
    .order("category", { ascending: true });

  if (error) throw error;

  return (data ?? []).map(toUpload);
}

export async function uploadAnalysisExcel(
  category: AnalysisCategory,
  file: File,
  userId?: string | null,
): Promise<AnalysisExcelUpload> {
  const sanitized = file.name || `${category}.xlsx`;
  const newPath = buildStoragePath(category, sanitized);

  const { data: existing, error: fetchError } = await supabase
    .from("analysis_excel_uploads")
    .select("id, storage_path")
    .eq("category", category)
    .maybeSingle();

  if (fetchError && fetchError.code !== "PGRST116") {
    throw fetchError;
  }

  const { error: uploadError } = await supabase.storage
    .from(ANALYSIS_BUCKET)
    .upload(newPath, file, { upsert: false, contentType: file.type || undefined });

  if (uploadError) {
    throw uploadError;
  }

  if (existing?.storage_path) {
    await supabase.storage.from(ANALYSIS_BUCKET).remove([existing.storage_path]).catch(() => undefined);
  }

  const { data: upserted, error: upsertError } = await supabase
    .from("analysis_excel_uploads")
    .upsert(
      {
        category,
        storage_path: newPath,
        file_name: file.name,
        file_size: file.size,
        mime_type: file.type || null,
        uploaded_by: userId ?? null,
        uploaded_at: new Date().toISOString(),
        checksum: null,
        has_header: true,
        header_row: 1,
      },
      { onConflict: "category" },
    )
    .select("*")
    .maybeSingle();

  if (upsertError) {
    throw upsertError;
  }

  if (!upserted) {
    throw new Error("Falha ao salvar metadados do upload");
  }

  return toUpload(upserted);
}

export async function deleteAnalysisExcelUpload(category: AnalysisCategory): Promise<void> {
  const { data, error } = await supabase
    .from("analysis_excel_uploads")
    .select("id, storage_path")
    .eq("category", category)
    .maybeSingle();

  if (error && error.code !== "PGRST116") {
    throw error;
  }

  if (!data) return;

  if (data.storage_path) {
    await supabase.storage.from(ANALYSIS_BUCKET).remove([data.storage_path]).catch(() => undefined);
  }

  const { error: deleteError } = await supabase
    .from("analysis_excel_uploads")
    .delete()
    .eq("id", data.id);

  if (deleteError) throw deleteError;
}

export async function downloadAnalysisExcel(upload: AnalysisExcelUpload): Promise<ArrayBuffer> {
  const { data, error } = await supabase.storage
    .from(ANALYSIS_BUCKET)
    .download(upload.storage_path);

  if (error || !data) {
    throw error ?? new Error("Falha ao baixar arquivo de análise");
  }

  return data.arrayBuffer();
}
