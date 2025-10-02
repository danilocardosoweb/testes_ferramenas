import { Matrix } from "@/types";

const STORAGE_KEY = "matrix_control_data";
const FOLDERS_KEY = "matrix_control_folders";

export const loadMatrices = (): Matrix[] => {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error("Error loading matrices:", error);
    return [];
  }
};

// Pastas
export const loadFolders = (): string[] => {
  try {
    const data = localStorage.getItem(FOLDERS_KEY);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error("Error loading folders:", error);
    return [];
  }
};

export const saveFolders = (folders: string[]): void => {
  try {
    localStorage.setItem(FOLDERS_KEY, JSON.stringify(folders));
  } catch (error) {
    console.error("Error saving folders:", error);
  }
};

export const saveMatrices = (matrices: Matrix[]): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(matrices));
  } catch (error) {
    console.error("Error saving matrices:", error);
  }
};

export const exportToJSON = (matrices: Matrix[]): void => {
  const dataStr = JSON.stringify(matrices, null, 2);
  const dataBlob = new Blob([dataStr], { type: "application/json" });
  const url = URL.createObjectURL(dataBlob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `matrizes_${new Date().toISOString().split("T")[0]}.json`;
  link.click();
  URL.revokeObjectURL(url);
};

export const importFromJSON = (file: File): Promise<Matrix[]> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string);
        resolve(Array.isArray(data) ? data : []);
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = reject;
    reader.readAsText(file);
  });
};
