import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { fetchDashboardData, verifyUserAccess } from '@/lib/data';

export async function GET() {
  // 1. Check if the user has a valid active session
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Double-check ACL eligibility (e.g. if their status was changed to Inactive or deleted)
  const { authorized } = await verifyUserAccess(session.user.email);
  if (!authorized) {
    return NextResponse.json({ error: "Access Denied" }, { status: 403 });
  }

  // 3. Fetch (and potentially cache) the ratings data
  const data = await fetchDashboardData();
  
  return NextResponse.json(data);
}
