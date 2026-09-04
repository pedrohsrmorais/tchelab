import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/gerador')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/gerador"!</div>
}
