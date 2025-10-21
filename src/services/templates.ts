import { supabase } from '@/lib/supabaseClient';

export interface EmailTemplate {
  key: string;      // ex: 'aprovadas', 'recebidas'
  name: string;     // rótulo amigável
  subject: string;
  body: string;
  updated_at?: string;
}

export async function listEmailTemplates(): Promise<EmailTemplate[]> {
  const { data, error } = await supabase
    .from('email_templates')
    .select('key,name,subject,body,updated_at')
    .order('key');
  if (error) throw error;
  return (data || []) as EmailTemplate[];
}

export async function upsertEmailTemplate(t: EmailTemplate): Promise<void> {
  const { error } = await supabase
    .from('email_templates')
    .upsert({ key: t.key, name: t.name, subject: t.subject, body: t.body })
    .eq('key', t.key);
  if (error) throw error;
}

export async function deleteEmailTemplate(key: string): Promise<void> {
  const { error } = await supabase
    .from('email_templates')
    .delete()
    .eq('key', key);
  if (error) throw error;
}


