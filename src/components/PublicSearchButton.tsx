import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export const PublicSearchButton = () => {
  const navigate = useNavigate();

  const handleKeyDown = (e: KeyboardEvent) => {
    // Verifica se Ctrl + A foi pressionado
    if (e.ctrlKey && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      navigate('/public/approved');
    }
  };

  useEffect(() => {
    // Adiciona o event listener quando o componente é montado
    window.addEventListener('keydown', handleKeyDown);
    
    // Remove o event listener quando o componente é desmontado
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  return (
    <div className="fixed bottom-6 right-6 z-50">
      <button
        onClick={() => navigate('/public/approved')}
        className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-full shadow-lg flex items-center gap-2 transition-all duration-200 transform hover:scale-105"
        title="Buscar Matrizes Aprovadas (Ctrl + A)"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        Buscar Matrizes
      </button>
    </div>
  );
};

export default PublicSearchButton;
