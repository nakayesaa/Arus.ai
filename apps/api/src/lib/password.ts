import bcrypt from 'bcrypt';

export interface PasswordVerifier {
  verify(password: string, passwordHash: string): Promise<boolean>;
}

export const bcryptPasswordVerifier: PasswordVerifier = {
  verify: (password, passwordHash) => bcrypt.compare(password, passwordHash),
};
