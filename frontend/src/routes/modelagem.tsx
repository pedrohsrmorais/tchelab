// routes/modelagem.tsx

import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/modelagem")({
  component: () => <Outlet />,
});