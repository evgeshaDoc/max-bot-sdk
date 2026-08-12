import type { Int64 } from './int64';

/** Basic MAX user or bot profile. */
export interface User {
  user_id: Int64;
  first_name: string;
  last_name?: string | null;
  username: string | null;
  is_bot: boolean;
  last_activity_time?: Int64;
  /** @deprecated MAX is replacing this field with `first_name`. */
  name: string | null;
}

/** MAX user profile with optional avatar and description. */
export interface UserWithPhoto extends User {
  description?: string | null;
  avatar_url?: string;
  full_avatar_url?: string;
}

/** User locale in IETF BCP 47 format. */
export type UserLocale = string;
