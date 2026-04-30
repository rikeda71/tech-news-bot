import { describe, expect, it } from "vite-plus/test";
import { checkUrlSafety } from "../../../worker/collector/url-safety";

describe("checkUrlSafety", () => {
  describe("allows safe public URLs", () => {
    it("allows https with a public hostname", () => {
      const result = checkUrlSafety("https://example.com/feed.xml");
      expect.soft(result.ok).toBe(true);
      if (result.ok) {
        expect.soft(result.url.hostname).toBe("example.com");
      }
    });

    it("allows http with a public hostname", () => {
      const result = checkUrlSafety("http://example.org");
      expect.soft(result.ok).toBe(true);
    });

    it("allows arbitrary port on a public hostname", () => {
      const result = checkUrlSafety("https://example.com:8080/x");
      expect.soft(result.ok).toBe(true);
    });
  });

  describe("blocks non-http/https protocols", () => {
    it("blocks file:// protocol", () => {
      const result = checkUrlSafety("file:///etc/passwd");
      expect.soft(result.ok).toBe(false);
      if (!result.ok) {
        expect.soft(result.reason).toContain("protocol not allowed");
      }
    });

    it("blocks ftp:// protocol", () => {
      const result = checkUrlSafety("ftp://example.com/feed.xml");
      expect.soft(result.ok).toBe(false);
    });

    it("blocks gopher:// protocol", () => {
      const result = checkUrlSafety("gopher://example.com/");
      expect.soft(result.ok).toBe(false);
    });

    it("rejects invalid URL that cannot be parsed", () => {
      const result = checkUrlSafety("not-a-url");
      expect.soft(result.ok).toBe(false);
      if (!result.ok) {
        expect.soft(result.reason).toBe("invalid URL");
      }
    });
  });

  describe("blocks localhost and local hostnames", () => {
    it("blocks localhost", () => {
      const result = checkUrlSafety("https://localhost/x");
      expect.soft(result.ok).toBe(false);
      if (!result.ok) {
        expect.soft(result.reason).toContain("host blocked");
      }
    });

    it("blocks LOCALHOST (case-insensitive)", () => {
      const result = checkUrlSafety("https://LOCALHOST/x");
      expect.soft(result.ok).toBe(false);
    });

    it("blocks subdomains of localhost", () => {
      const result = checkUrlSafety("https://foo.localhost/x");
      expect.soft(result.ok).toBe(false);
    });

    it("blocks .local mDNS hostnames", () => {
      const result = checkUrlSafety("https://myserver.local/feed");
      expect.soft(result.ok).toBe(false);
    });

    it("blocks metadata.google.internal (GCP metadata)", () => {
      const result = checkUrlSafety("http://metadata.google.internal/computeMetadata/v1/");
      expect.soft(result.ok).toBe(false);
      if (!result.ok) {
        expect.soft(result.reason).toContain("host blocked");
      }
    });

    it("blocks localhost. with trailing dot (FQDN form)", () => {
      // 末尾ドットは DNS 上 "localhost" と同義のため bypass を防ぐ
      const result = checkUrlSafety("https://localhost./x");
      expect.soft(result.ok).toBe(false);
    });

    it("blocks metadata.google.internal. with trailing dot", () => {
      const result = checkUrlSafety("http://metadata.google.internal./latest/");
      expect.soft(result.ok).toBe(false);
    });

    it("blocks foo.local. with trailing dot", () => {
      const result = checkUrlSafety("https://foo.local./x");
      expect.soft(result.ok).toBe(false);
    });
  });

  describe("blocks private IPv4 addresses", () => {
    it("blocks 127.0.0.1 (loopback)", () => {
      const result = checkUrlSafety("https://127.0.0.1/x");
      expect.soft(result.ok).toBe(false);
      if (!result.ok) {
        expect.soft(result.reason).toContain("private IPv4");
      }
    });

    it("blocks 127.0.0.2 (loopback range)", () => {
      const result = checkUrlSafety("https://127.0.0.2/x");
      expect.soft(result.ok).toBe(false);
    });

    it("blocks 169.254.169.254 (AWS metadata endpoint)", () => {
      const result = checkUrlSafety("https://169.254.169.254/latest/meta-data/");
      expect.soft(result.ok).toBe(false);
      if (!result.ok) {
        expect.soft(result.reason).toContain("private IPv4");
      }
    });

    it("blocks 10.0.0.1 (RFC 1918 class A)", () => {
      const result = checkUrlSafety("https://10.0.0.1/x");
      expect.soft(result.ok).toBe(false);
    });

    it("blocks 10.255.255.255 (RFC 1918 class A upper bound)", () => {
      const result = checkUrlSafety("https://10.255.255.255/x");
      expect.soft(result.ok).toBe(false);
    });

    it("blocks 192.168.1.1 (RFC 1918 class C)", () => {
      const result = checkUrlSafety("https://192.168.1.1/x");
      expect.soft(result.ok).toBe(false);
    });

    it("blocks 172.16.0.1 (RFC 1918 class B lower bound)", () => {
      const result = checkUrlSafety("https://172.16.0.1/x");
      expect.soft(result.ok).toBe(false);
    });

    it("blocks 172.31.255.255 (RFC 1918 class B upper bound)", () => {
      const result = checkUrlSafety("https://172.31.255.255/x");
      expect.soft(result.ok).toBe(false);
    });

    it("allows 172.32.0.1 (just outside RFC 1918 class B)", () => {
      const result = checkUrlSafety("https://172.32.0.1/x");
      expect.soft(result.ok).toBe(true);
    });

    it("blocks 0.0.0.0 (0.0.0.0/8)", () => {
      const result = checkUrlSafety("https://0.0.0.0/x");
      expect.soft(result.ok).toBe(false);
    });

    it("blocks 100.64.0.1 (CGNAT)", () => {
      const result = checkUrlSafety("https://100.64.0.1/x");
      expect.soft(result.ok).toBe(false);
    });

    it("blocks 224.0.0.1 (multicast)", () => {
      const result = checkUrlSafety("https://224.0.0.1/x");
      expect.soft(result.ok).toBe(false);
    });

    it("blocks 240.0.0.1 (reserved)", () => {
      const result = checkUrlSafety("https://240.0.0.1/x");
      expect.soft(result.ok).toBe(false);
    });

    it("blocks 192.0.2.1 (TEST-NET-1, 192.0.2.0/24)", () => {
      const result = checkUrlSafety("https://192.0.2.1/x");
      expect.soft(result.ok).toBe(false);
    });

    it("blocks 198.51.100.1 (TEST-NET-2, 198.51.100.0/24)", () => {
      const result = checkUrlSafety("https://198.51.100.1/x");
      expect.soft(result.ok).toBe(false);
    });

    it("blocks 203.0.113.1 (TEST-NET-3, 203.0.113.0/24)", () => {
      const result = checkUrlSafety("https://203.0.113.1/x");
      expect.soft(result.ok).toBe(false);
    });

    it("allows 192.1.1.1 (just outside 192.0.0.0/24 IETF range)", () => {
      const result = checkUrlSafety("https://192.1.1.1/x");
      expect.soft(result.ok).toBe(true);
    });

    it("allows 198.51.99.1 (just outside TEST-NET-2 /24)", () => {
      const result = checkUrlSafety("https://198.51.99.1/x");
      expect.soft(result.ok).toBe(true);
    });

    it("allows 203.0.112.1 (just outside TEST-NET-3 /24)", () => {
      const result = checkUrlSafety("https://203.0.112.1/x");
      expect.soft(result.ok).toBe(true);
    });
  });

  describe("blocks numeric hostnames (octal/hex disguise)", () => {
    it("blocks 0177.0.0.1 (octal representation of 127.0.0.1, normalized by URL parser)", () => {
      // URL クラスが 0177.0.0.1 → 127.0.0.1 に正規化するため private IPv4 としてブロックされる
      const result = checkUrlSafety("https://0177.0.0.1/x");
      expect.soft(result.ok).toBe(false);
    });
  });

  describe("blocks private IPv6 addresses", () => {
    it("blocks [::1] (IPv6 loopback)", () => {
      const result = checkUrlSafety("http://[::1]/x");
      expect.soft(result.ok).toBe(false);
      if (!result.ok) {
        expect.soft(result.reason).toContain("private IPv6");
      }
    });

    it("blocks [fe80::1] (link-local)", () => {
      const result = checkUrlSafety("http://[fe80::1]/x");
      expect.soft(result.ok).toBe(false);
    });

    it("blocks [2001:db8::1] (documentation range)", () => {
      const result = checkUrlSafety("http://[2001:db8::1]/x");
      expect.soft(result.ok).toBe(false);
    });

    it("blocks [fc00::1] (unique local)", () => {
      const result = checkUrlSafety("http://[fc00::1]/x");
      expect.soft(result.ok).toBe(false);
    });

    it("blocks [fd00::1] (unique local)", () => {
      const result = checkUrlSafety("http://[fd00::1]/x");
      expect.soft(result.ok).toBe(false);
    });

    it("blocks [ff02::1] (multicast)", () => {
      const result = checkUrlSafety("http://[ff02::1]/x");
      expect.soft(result.ok).toBe(false);
    });

    it("blocks [::ffff:127.0.0.1] (IPv4-mapped loopback)", () => {
      const result = checkUrlSafety("http://[::ffff:127.0.0.1]/x");
      expect.soft(result.ok).toBe(false);
    });

    it("blocks [::ffff:169.254.169.254] (IPv4-mapped AWS metadata)", () => {
      const result = checkUrlSafety("http://[::ffff:169.254.169.254]/x");
      expect.soft(result.ok).toBe(false);
    });
  });
});
