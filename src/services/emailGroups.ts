import { supabase } from '@/lib/supabaseClient';

export interface EmailGroup {
  id: string;
  name: string;
  emails: string[];
  created_at: string;
  updated_at: string;
}

export interface NotificationGroupMapping {
  category: string; // 'aprovadas', 'reprovado', 'limpeza', 'correcao_externa', 'recebidas'
  group_id: string | null; // null = não enviar para ninguém
}

export async function listEmailGroups(): Promise<EmailGroup[]> {
  const { data, error } = await supabase
    .from('email_groups')
    .select('*')
    .order('name');
  if (error) throw error;
  return (data || []) as EmailGroup[];
}

export async function createEmailGroup(name: string, emails: string[]): Promise<EmailGroup> {
  const { data, error } = await supabase
    .from('email_groups')
    .insert({ name, emails })
    .select()
    .single();
  if (error) throw error;
  return data as EmailGroup;
}

export async function updateEmailGroup(id: string, name: string, emails: string[]): Promise<void> {
  const { error } = await supabase
    .from('email_groups')
    .update({ name, emails })
    .eq('id', id);
  if (error) throw error;
}

export async function deleteEmailGroup(id: string): Promise<void> {
  const { error } = await supabase
    .from('email_groups')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

export async function getNotificationGroupMappings(): Promise<NotificationGroupMapping[]> {
  const { data, error } = await supabase
    .from('notification_group_mappings')
    .select('*');
  if (error) throw error;
  return (data || []) as NotificationGroupMapping[];
}

export async function updateNotificationGroupMapping(category: string, groupId: string | null): Promise<void> {
  const { error } = await supabase
    .from('notification_group_mappings')
    .upsert({ category, group_id: groupId })
    .eq('category', category);
  if (error) throw error;
}
