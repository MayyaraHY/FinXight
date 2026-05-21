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
  roles: string[];
  createdAt: string;
}