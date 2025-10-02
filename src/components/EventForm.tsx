import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { v4 as uuidv4 } from "uuid";
import { MatrixEvent, EVENT_TYPES } from "@/types";
import { Plus } from "lucide-react";

interface EventFormProps {
  onSubmit: (event: MatrixEvent) => void;
  defaultDate?: string; // data sugerida (ex.: último evento)
  minDate?: string;     // data mínima permitida (ex.: último evento)
}

export const EventForm = ({ onSubmit, defaultDate, minDate }: EventFormProps) => {
  const [date, setDate] = useState<string>(defaultDate || new Date().toISOString().split("T")[0]);
  const [type, setType] = useState<string>("Teste Inicial");
  const [comment, setComment] = useState("");
  const [location, setLocation] = useState("");
  const [responsible, setResponsible] = useState("");

  // Atualiza a data quando a matriz selecionada muda (defaultDate)
  useEffect(() => {
    if (defaultDate) {
      setDate(defaultDate);
    }
  }, [defaultDate]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!comment.trim()) return;

    const newEvent: MatrixEvent = {
      id: uuidv4(),
      date,
      type,
      comment: comment.trim(),
      location: location.trim(),
      responsible: responsible.trim() || undefined,
    };

    onSubmit(newEvent);
    setDate(defaultDate || new Date().toISOString().split("T")[0]);
    setType("Teste Inicial");
    setComment("");
    setLocation("");
    setResponsible("");
  };

  return (
    <Card className="shadow-lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Plus className="h-5 w-5" />
          Adicionar Evento
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="event-date">Data</Label>
            <Input
              id="event-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
              className="mt-1"
            />
            {minDate && new Date(date).getTime() < new Date(minDate).getTime() && (
              <p className="mt-1 text-xs text-amber-600">
                Atenção: a data informada é anterior ao último evento.
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="event-type">Tipo de Evento</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EVENT_TYPES.map((eventType) => (
                  <SelectItem key={eventType} value={eventType}>
                    {eventType}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="event-location">Local (opcional)</Label>
            <Input
              id="event-location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Ex: Linha 1"
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="event-responsible">Responsável (opcional)</Label>
            <Input
              id="event-responsible"
              value={responsible}
              onChange={(e) => setResponsible(e.target.value)}
              placeholder="Operador/Responsável pelo evento"
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="event-comment">Comentário</Label>
            <Textarea
              id="event-comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Descreva o evento..."
              required
              className="mt-1 min-h-[80px]"
            />
          </div>

          <Button type="submit" className="w-full">
            Adicionar Evento
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};

export default EventForm;
