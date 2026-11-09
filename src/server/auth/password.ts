import "server-only";
import bcrypt from "bcryptjs";

const COST = 10;
let dummyHash: string | null = null;

export const hashPassword = (plain: string) => bcrypt.hash(plain, COST);

/** Always performs one bcrypt comparison so unknown emails take similar time. */
export async function verifyPassword(plain: string, hash: string | null): Promise<boolean> {
  if (hash === null) {
    dummyHash ??= await bcrypt.hash("timing-equalizer-not-a-credential", COST);
    await bcrypt.compare(plain, dummyHash);
    return false;
  }
  return bcrypt.compare(plain, hash);
}
