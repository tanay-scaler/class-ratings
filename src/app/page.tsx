import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { fetchDashboardData, verifyUserAccess } from '@/lib/data';
import { DashboardClient } from '@/components/DashboardClient';

export default async function DashboardPage() {
  // 1. Retrieve the session on the server side (instant load check)
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    redirect('/login');
  }

  // 2. Validate current ACL role and status
  const { authorized, role } = await verifyUserAccess(session.user.email);
  
  if (!authorized) {
    redirect('/login?error=AccessDenied');
  }

  // 3. Fetch ratings data (cached via server-side Next.js fetch revalidation)
  const data = await fetchDashboardData();

  // 4. Render the client dashboard, passing session user context and initial dataset
  return (
    <DashboardClient 
      data={data} 
      user={{
        name: session.user.name,
        email: session.user.email,
        image: session.user.image,
        role: role
      }} 
    />
  );
}
