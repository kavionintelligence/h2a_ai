import type { EmployeeWorkspaceApi, VerifyHumanV2Request } from '@h2a/contracts';
import type { Page } from 'playwright';

export async function signInProductionEmployee(page: Page, employeeId: string, verification: VerifyHumanV2Request): Promise<void> {
  await page.getByRole('heading', { name: 'Sign in as yourself' }).waitFor({ timeout: 60_000 });
  const challenge = await page.evaluate(async id => (window as unknown as { h2aEmployee: EmployeeWorkspaceApi }).h2aEmployee.begin(id), employeeId);
  await page.evaluate(async input => {
    const api = (window as unknown as { h2aEmployee: EmployeeWorkspaceApi }).h2aEmployee;
    const result = await api.verify({ ...input.verification, purpose: input.purpose });
    if (result.last_result?.decision !== 'verified') throw new Error(JSON.stringify(result.last_result));
    await api.login(result.active_proofs[0]!.human_proof_id);
  }, { verification, purpose: challenge.purpose });
  const active = await page.evaluate(async () => (window as unknown as { h2aEmployee: EmployeeWorkspaceApi }).h2aEmployee.hasSession());
  if (!active) throw new Error('Production employee session did not remain active after login.');
  await page.evaluate(() => window.dispatchEvent(new Event('h2a:employee-session-changed')));
  await page.getByText(/Test Employee/u).first().waitFor({ timeout: 15_000 });
}
