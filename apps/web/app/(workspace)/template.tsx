import type { ReactNode } from 'react';

interface WorkspaceTemplateProps {
  children: ReactNode;
}

export default function WorkspaceTemplate({
  children,
}: WorkspaceTemplateProps) {
  return <div className="workspace-route-transition">{children}</div>;
}
