import bcrypt from 'bcrypt';

export interface PasswordVerifier {
  verify(password: string, passwordHash: string): Promise<boolean>;
}

export interface PasswordHasher {
  hash(password: string): Promise<string>;
}

export const bcryptPasswordVerifier: PasswordVerifier = {
  verify: (password, passwordHash) => bcrypt.compare(password, passwordHash),
};

export const bcryptPasswordHasher: PasswordHasher = {
  hash: (password) => bcrypt.hash(password, 12),
};
