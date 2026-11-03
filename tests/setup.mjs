// Wird vor jeder Testdatei geladen (npm test): fester Zufalls-Seed, damit Deploys nicht an seltenen
// Zufallsfällen scheitern. Einzelne Tests können mit seedRandom() einen eigenen Seed setzen.
import { seedRandom } from '../src/shared/rng.js';
seedRandom(+(process.env.TEST_SEED || 20261103));
