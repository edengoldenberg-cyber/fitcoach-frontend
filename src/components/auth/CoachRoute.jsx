import React from 'react';
import { Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Loader2 } from 'lucide-react';

/**
 * Renders children only for coaches (users who have at least one trainee)
 * and admins. Pure trainees are redirected to '/'.
 *
 * Coach detection: Trainee.filter({ coach_email: user.email }).length > 0
 * Admin bypass: user.role === 'admin' skips the trainee query entirely.
 *
 * Both queries use the shared TanStack Query cache — if the parent already
 * loaded ['currentUser'] and ['coachGuardTrainees', email] they resolve
 * synchronously with no extra network call.
 */
export default function CoachRoute({ children }) {
  const { data: user, isLoading: loadingUser } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const isAdmin = user?.role === 'admin';

  const { data: coachTrainees, isLoading: loadingCoach } = useQuery({
    queryKey: ['coachGuardTrainees', user?.email],
    queryFn: () => base44.entities.Trainee.filter({ coach_email: user.email }),
    enabled: !!user?.email && !isAdmin,
    staleTime: 5 * 60 * 1000,
  });

  // Wait for user to load; also wait for coach check unless we already know admin
  if (loadingUser || (!isAdmin && loadingCoach)) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  const isCoach = isAdmin || (coachTrainees?.length > 0);

  if (!user || !isCoach) {
    return <Navigate to="/" replace />;
  }

  return children;
}
