import { canonicalJson, sha256 } from './canonical-json.js';

describe('canonicalJson', () => {
  it('ordena claves recursivamente y conserva el orden de los arrays', () => {
    const a = { b: 1, a: { d: [3, { z: 1, y: 2 }], c: null } };
    const b = { a: { c: null, d: [3, { y: 2, z: 1 }] }, b: 1 };
    expect(canonicalJson(a)).toBe(canonicalJson(b));
    expect(canonicalJson(a)).toBe('{"a":{"c":null,"d":[3,{"y":2,"z":1}]},"b":1}');
    expect(canonicalJson([2, 1])).not.toBe(canonicalJson([1, 2]));
  });

  it('produce hashes estables', () => {
    expect(sha256(canonicalJson({ x: 1, y: 2 }))).toBe(sha256(canonicalJson({ y: 2, x: 1 })));
  });
});
