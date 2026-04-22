import { assertEquals } from "@std/assert";

import { truncateIp } from "../../src/logs/ip.ts";

Deno.test({
  name: "AC-19.4: IPv4 is truncated to /24 by zeroing the last octet",
  fn: () => {
    assertEquals(truncateIp("203.0.113.42"), "203.0.113.0/24");
    assertEquals(truncateIp("10.0.0.1"), "10.0.0.0/24");
  },
});

Deno.test({
  name: "AC-19.5: IPv6 is truncated to /48 keeping only the first 3 groups",
  fn: () => {
    assertEquals(truncateIp("2001:db8:abcd:1234::1"), "2001:db8:abcd::/48");
    assertEquals(truncateIp("2001:0db8:abcd:1234::1"), "2001:db8:abcd::/48");
    assertEquals(truncateIp("fe80::1"), "fe80:0:0::/48");
  },
});

Deno.test({
  name: "AC-19.4: invalid or empty IP returns empty string",
  fn: () => {
    assertEquals(truncateIp(""), "");
    assertEquals(truncateIp("not-an-ip"), "");
    assertEquals(truncateIp("1.2.3"), "");
  },
});
