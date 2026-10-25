import { DutyTracker } from "@/components/guard/duty-tracker";
import { DashboardShell } from "@/components/layout/dashboard-shell";

export const metadata = { title: "My Duty" };

export default function DutyPage() {
  return (
    <DashboardShell>
      <DutyTracker />
    </DashboardShell>
  );
}