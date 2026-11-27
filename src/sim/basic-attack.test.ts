import { describe, expect, it } from 'vitest';
import { createRng } from './rng';
import { createWorld, setWeaponKind, stepWorld } from './world';
import { basicSkillFor } from '../data/skills';

/** 造一个「一次普攻必中、不暴击、不打偏」的场景，只看倍率对不对。 */
function oneSwing(kind: 'sword' | 'blade') {
  const rng = createRng(42);
  const world = createWorld({ rng, floorId: 'f1', equipped: {} });
  world.player.level = 1;
  setWeaponKind(world, kind);
  // 关掉主动技，只留普攻
  world.controls.autoSkills = false;
  // 只留一只怪，贴脸站好
  world.monsters = world.monsters.slice(0, 1);
  const target = world.monsters[0]!;
  target.pos = { ...world.player.pos };
  world.player.attackCd = 0;

  const before = target.hp;
  stepWorld(world, { rng: createRng(1), equipped: {}, onLoot: () => {}, onKill: () => {} });
  return { before, after: target.hp, kind };
}

describe('普攻也吃武器：刀的普攻倍率比剑高', () => {
  it('两只手拿的普攻倍率不一样，这是数据里就写好的', () => {
    const sword = basicSkillFor('sword')!;
    const blade = basicSkillFor('blade')!;
    expect(sword.power).toBe(1.0);
    expect(blade.power).toBeGreaterThan(sword.power);
  });

  it('打在同一只怪身上，刀的一下比剑重（不是同一个 1.0 倍率走过场）', () => {
    // 同一颗种子、同一只怪、同样的护甲，只有武器不同
    const swordHit = oneSwing('sword');
    const bladeHit = oneSwing('blade');
    const swordDmg = swordHit.before - swordHit.after;
    const bladeDmg = bladeHit.before - bladeHit.after;

    expect(swordDmg).toBeGreaterThan(0);
    expect(bladeDmg).toBeGreaterThan(swordDmg);
  });
});
