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

  return null;
};

export default PublicSearchButton;
