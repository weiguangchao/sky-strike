import test from 'node:test';
import { checkSprites } from '../scripts/check-sprites.ts';

test('all 2D sprite layers match their source, stay inside the atlas and fit mobile budgets', checkSprites);
