import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronDown, Plus, Minus } from "lucide-react";

interface CollapsibleCardProps {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

export const CollapsibleCard = ({ title, defaultOpen = false, children }: CollapsibleCardProps) => {
  const [open, setOpen] = useState<boolean>(defaultOpen);

  return (
    <Card className="shadow-lg overflow-hidden">
      <CardHeader className="py-3">
        <div className="inline-flex items-center gap-2">
          <CardTitle className="text-lg">{title}</CardTitle>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? "Recolher" : "Expandir"}
            title={open ? "Recolher" : "Expandir"}
          >
            {open ? <Minus className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
          </Button>
        </div>
      </CardHeader>
      {open && (
        <CardContent>
          {children}
        </CardContent>
      )}
    </Card>
  );
};

export default CollapsibleCard;
