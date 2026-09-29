import { StatusScreen } from "@/components/status-screen";

export default function NotFound(): React.JSX.Element {
  return (
    <StatusScreen
      title="Page not found"
      message="The page you requested does not exist."
      eyebrow="404"
      tone="info"
      primaryAction={{ label: "Back to home", href: "/" }}
    />
  );
}
