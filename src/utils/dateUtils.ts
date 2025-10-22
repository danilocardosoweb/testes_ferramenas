/**
 * Utilitários para manipulação de datas com suporte a fuso horário
 */

/**
 * Adiciona horas a uma data, considerando o fuso horário local
 */
export const addHours = (date: Date, hours: number): Date => {
  const result = new Date(date);
  result.setHours(result.getHours() + hours);
  return result;
};

/**
 * Converte uma data para o fuso horário local no formato ISO (YYYY-MM-DD)
 */
export const toLocalISOString = (date: Date | string): string => {
  const d = typeof date === 'string' ? new Date(date) : new Date(date);
  if (isNaN(d.getTime())) return ''; // Retorna string vazia para datas inválidas
  
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  
  return `${year}-${month}-${day}`;
};

/**
 * Formata uma data para o padrão brasileiro (DD/MM/YYYY)
 */
export const formatToBR = (date: Date | string): string => {
  try {
    const d = typeof date === 'string' ? new Date(date) : new Date(date);
    if (isNaN(d.getTime())) return 'Data inválida';
    
    return d.toLocaleDateString('pt-BR');
  } catch {
    return 'Data inválida';
  }
};

/**
 * Formata uma data e hora para o padrão brasileiro (DD/MM/YYYY HH:MM)
 */
export const formatDateTimeToBR = (date: Date | string): string => {
  try {
    const d = typeof date === 'string' ? new Date(date) : new Date(date);
    if (isNaN(d.getTime())) return 'Data inválida';
    
    return d.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
  } catch {
    return 'Data inválida';
  }
};

/**
 * Adiciona dias úteis a uma data (exclui finais de semana)
 */
export const addBusinessDays = (date: Date, days: number): Date => {
  const result = new Date(date);
  let daysToAdd = days;
  
  while (daysToAdd > 0) {
    result.setDate(result.getDate() + 1);
    // Se não for sábado (6) nem domingo (0)
    if (result.getDay() !== 0 && result.getDay() !== 6) {
      daysToAdd--;
    }
  }
  
  return result;
};

/**
 * Calcula a diferença em dias entre duas datas, ignorando o horário
 */
export const dateDiffInDays = (a: Date, b: Date): number => {
  // Normaliza as datas para o mesmo horário (meio-dia) para evitar problemas de horário de verão
  const utc1 = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const utc2 = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.floor((utc2 - utc1) / (1000 * 60 * 60 * 24));
};
