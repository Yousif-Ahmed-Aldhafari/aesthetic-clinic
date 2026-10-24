import * as argon2 from 'argon2';

export const hashPassword = (password: string) => argon2.hash(password, {
  type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 1,
});
export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try { return hash.startsWith('$argon2id$') && await argon2.verify(hash, password); }
  catch { return false; }
}
