import { supabase } from "@/lib/supabaseClient";
import { User, AuthSession } from "@/types";

// Simples hash para desenvolvimento (em produção, use bcrypt no backend)
const simpleHash = (password: string): string => {
  return btoa(password); // Base64 - APENAS PARA DESENVOLVIMENTO
};

export async function login(email: string, password: string): Promise<AuthSession> {
  const passwordHash = simpleHash(password);
  
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('email', email)
    .eq('is_active', true)
    .single();

  if (error || !data) {
    throw new Error('Email ou senha inválidos');
  }

  // Verificar senha (em produção, use bcrypt.compare)
  if (data.password_hash !== passwordHash) {
    throw new Error('Email ou senha inválidos');
  }

  // Criar sessão
  const token = crypto.randomUUID();
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 8); // 8 horas

  const { error: sessionError } = await supabase
    .from('user_sessions')
    .insert({
      user_id: data.id,
      token,
      expires_at: expiresAt.toISOString(),
    });

  if (sessionError) {
    throw new Error('Erro ao criar sessão');
  }

  const user: User = {
    id: data.id,
    email: data.email,
    name: data.name,
    role: data.role,
    isActive: data.is_active,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };

  const session: AuthSession = {
    user,
    token,
    expiresAt: expiresAt.toISOString(),
  };

  // Salvar no localStorage
  localStorage.setItem('auth_session', JSON.stringify(session));

  return session;
}

export async function logout(): Promise<void> {
  const sessionStr = localStorage.getItem('auth_session');
  if (sessionStr) {
    try {
      const session: AuthSession = JSON.parse(sessionStr);
      await supabase
        .from('user_sessions')
        .delete()
        .eq('token', session.token);
    } catch (err) {
      console.error('Erro ao fazer logout:', err);
    }
  }
  localStorage.removeItem('auth_session');
}

export function getCurrentSession(): AuthSession | null {
  const sessionStr = localStorage.getItem('auth_session');
  if (!sessionStr) return null;

  try {
    const session: AuthSession = JSON.parse(sessionStr);
    const now = new Date();
    const expiresAt = new Date(session.expiresAt);

    if (now >= expiresAt) {
      localStorage.removeItem('auth_session');
      return null;
    }

    return session;
  } catch (err) {
    console.error('Erro ao recuperar sessão:', err);
    localStorage.removeItem('auth_session');
    return null;
  }
}

export async function validateSession(token: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('user_sessions')
    .select('expires_at')
    .eq('token', token)
    .single();

  if (error || !data) return false;

  const now = new Date();
  const expiresAt = new Date(data.expires_at);

  return now < expiresAt;
}

// CRUD de usuários (apenas admin)
export async function listUsers(): Promise<User[]> {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .order('name');

  if (error) throw error;

  return (data || []).map((u: any) => ({
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    isActive: u.is_active,
    createdAt: u.created_at,
    updatedAt: u.updated_at,
  }));
}

export async function createUser(email: string, name: string, password: string, role: 'admin' | 'editor' | 'viewer'): Promise<User> {
  const passwordHash = simpleHash(password);

  const { data, error } = await supabase
    .from('users')
    .insert({
      email,
      name,
      password_hash: passwordHash,
      role,
      is_active: true,
    })
    .select()
    .single();

  if (error) throw error;

  return {
    id: data.id,
    email: data.email,
    name: data.name,
    role: data.role,
    isActive: data.is_active,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

export async function updateUser(id: string, updates: Partial<{ name: string; email: string; role: 'admin' | 'editor' | 'viewer'; isActive: boolean }>): Promise<void> {
  const dbUpdates: any = {};
  if (updates.name !== undefined) dbUpdates.name = updates.name;
  if (updates.email !== undefined) dbUpdates.email = updates.email;
  if (updates.role !== undefined) dbUpdates.role = updates.role;
  if (updates.isActive !== undefined) dbUpdates.is_active = updates.isActive;

  const { error } = await supabase
    .from('users')
    .update(dbUpdates)
    .eq('id', id);

  if (error) throw error;
}

export async function deleteUser(id: string): Promise<void> {
  const { error } = await supabase
    .from('users')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

export async function changePassword(userId: string, newPassword: string): Promise<void> {
  const passwordHash = simpleHash(newPassword);

  const { error } = await supabase
    .from('users')
    .update({ password_hash: passwordHash })
    .eq('id', userId);

  if (error) throw error;
}
