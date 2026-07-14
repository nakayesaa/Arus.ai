import { redirect } from 'next/navigation';

interface AcceptInvitationPageProps {
  searchParams: Promise<{ token?: string }>;
}

export default async function AcceptInvitationPage({
  searchParams,
}: AcceptInvitationPageProps) {
  const { token = '' } = await searchParams;
  redirect(`/welcome#token=${encodeURIComponent(token)}`);
}
