export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName?: string;
  phone?: string;
  address?: string;
  position?: string;
  pictureUrl?: string;
  active: boolean;
  verified: boolean;
  /** True until the user finishes onboarding (creates their first company). Drives post-login routing. */
  firstLogin: boolean;
  roles: string[];
  createdAt: string;
}