/**
 * SSRF 対策: URL が外部アクセスとして安全かどうかを検査するヘルパー。
 * admin endpoint の /api/admin/feeds/validate から利用される。
 * collector の isSafeUrl (プロトコル prefix チェックのみ) より厳密に、
 * 内部 IP アドレス・特殊用途ホスト名・危険なプロトコルをブロックする。
 */

export type UrlSafetyResult = { ok: true; url: URL } | { ok: false; reason: string };

export function checkUrlSafety(input: string): UrlSafetyResult {
  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    return { ok: false, reason: "invalid URL" };
  }

  // http / https 以外のプロトコル (file:, gopher:, dict:, ftp: 等) はブロック
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, reason: `protocol not allowed: ${parsed.protocol}` };
  }

  // URL.hostname は IPv6 リテラルの場合 "[::1]" のようにブラケット付きで返る。
  // 末尾ドット (FQDN 形式: "localhost.") を除去してから検査する (DNS では同一視されるため bypass を防ぐ)
  const host = parsed.hostname.toLowerCase().replace(/\.+$/, "");

  // localhost / .localhost / .local / metadata.google.internal などのホスト名
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host === "metadata.google.internal"
  ) {
    return { ok: false, reason: `host blocked: ${host}` };
  }

  // IPv6 リテラル ([::1], [::1%eth0] 形式)
  if (host.startsWith("[") && host.endsWith("]")) {
    // zoneid (%eth0 等) を取り除いてから検査する
    const ipv6 = host.slice(1, -1).split("%")[0];
    if (ipv6 === undefined || isPrivateIPv6(ipv6)) {
      return { ok: false, reason: `private IPv6: ${host}` };
    }
    return { ok: true, url: parsed };
  }

  // IPv4 リテラル (dotted-decimal 形式)
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    if (isPrivateIPv4(host)) {
      return { ok: false, reason: `private IPv4: ${host}` };
    }
    return { ok: true, url: parsed };
  }

  // 数字で始まる hostname (octal / hex / short-form の IPv4 擬装を拒否)
  // 例: 0177.0.0.1 (= 127.0.0.1 の octal 表記)
  if (/^\d/.test(host)) {
    return { ok: false, reason: `numeric hostname not allowed: ${host}` };
  }

  return { ok: true, url: parsed };
}

/**
 * RFC 1918 / RFC 5735 などで定義されたプライベート・特殊用途 IPv4 かどうかを判定する。
 * dotted-decimal 形式 ("a.b.c.d") のみ受け付ける。
 */
function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return false;

  const [a, b, c] = parts;
  if (a === undefined || b === undefined || c === undefined) return false;

  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
  if (a === 127) return true; // 127.0.0.0/8 loopback
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local (AWS/GCP metadata)
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 0 && c === 0) return true; // 192.0.0.0/24 IETF protocol assignments
  if (a === 192 && b === 0 && c === 2) return true; // 192.0.2.0/24 TEST-NET-1
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15 benchmark
  if (a === 198 && b === 51 && c === 100) return true; // 198.51.100.0/24 TEST-NET-2
  if (a === 203 && b === 0 && c === 113) return true; // 203.0.113.0/24 TEST-NET-3
  if (a >= 224) return true; // 224.0.0.0/4 multicast + 240.0.0.0/4 reserved + 255.255.255.255

  return false;
}

/**
 * プライベート・特殊用途 IPv6 かどうかを判定する。
 * IPv4-mapped アドレス (::ffff:x.x.x.x) は内部の IPv4 を再帰的に検査する。
 */
function isPrivateIPv6(ip: string): boolean {
  const v = ip.toLowerCase();

  if (v === "::1") return true; // loopback
  if (v === "::") return true; // unspecified
  // fe80::/10 link-local: 先頭 10 ビットが 1111111010 = fe80〜febf
  if (/^fe[89ab][0-9a-f]/i.test(v)) return true;
  if (/^f[cd]/.test(v)) return true; // fc00::/7 unique local (fc / fd)
  if (v.startsWith("ff")) return true; // ff00::/8 multicast
  if (v.startsWith("2001:db8")) return true; // 2001:db8::/32 documentation

  // IPv4-mapped: URL クラスは ::ffff:127.0.0.1 を ::ffff:7f00:1 のように
  // 16 進数形式 (xxxx:xxxx) に正規化するため、両形式を検査する。
  if (v.startsWith("::ffff:")) {
    const tail = v.slice(7);
    // dotted-decimal 形式 (直接入力された場合)
    if (/^\d+\.\d+\.\d+\.\d+$/.test(tail)) {
      return isPrivateIPv4(tail);
    }
    // 16 進数形式 (URL クラスが正規化した形式: xxxx:xxxx)
    const hexMatch = /^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(tail);
    if (hexMatch) {
      const [, hi, lo] = hexMatch;
      const ipv4 = ipv4MappedHexToDecimal(hi, lo);
      if (ipv4 !== null) return isPrivateIPv4(ipv4);
    }
  }

  return false;
}

/**
 * IPv4-mapped IPv6 の 16 進数部分 (hi:lo) を dotted-decimal に変換する。
 * 例: "7f00", "1" -> "127.0.0.1"
 */
function ipv4MappedHexToDecimal(hi: string, lo: string): string | null {
  const hiNum = Number.parseInt(hi, 16);
  const loNum = Number.parseInt(lo, 16);
  if (Number.isNaN(hiNum) || Number.isNaN(loNum)) return null;
  return [(hiNum >> 8) & 0xff, hiNum & 0xff, (loNum >> 8) & 0xff, loNum & 0xff].join(".");
}
