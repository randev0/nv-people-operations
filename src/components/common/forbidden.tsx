import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export function Forbidden({ message }: { message: string }) {
  return (
    <Alert>
      <AlertTitle>Not available</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}
