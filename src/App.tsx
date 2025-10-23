import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import PublicApprovedView from "./pages/PublicApprovedView";
import PublicSearchButton from "./components/PublicSearchButton";

const queryClient = new QueryClient();

const AppContent = () => {
  const location = useLocation();
  const isPublicPage = location.pathname.startsWith('/public/');
  
  return (
    <>
      <Routes>
        <Route path="/" element={<Index />} />
        <Route path="/public/approved" element={<PublicApprovedView />} />
        {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
        <Route path="*" element={<NotFound />} />
      </Routes>
      
      {/* Mostra o botão apenas se não estiver na página pública */}
      {!isPublicPage && <PublicSearchButton />}
    </>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AppContent />
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
