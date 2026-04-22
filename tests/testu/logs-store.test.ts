import { assertEquals } from "@std/assert";

import {
  _getDetailedBufferForTests,
  _getNetworkBufferForTests,
  _hasBlobForTests,
  _resetStoreForTests,
  _setLastActivityForTests,
  append,
  flushSince,
  getStreamCount,
  purge,
  subscribe,
} from "../../src/logs/store.ts";
import type { LogEntry } from "../../src/logs/events.ts";

function makeNetwork(ts: number, path = "/foo"): LogEntry {
  return {
    type: "network",
    ts,
    method: "GET",
    path,
    status: 200,
    durationMs: 10,
    ipPrefix: "203.0.113.0/24",
  };
}

Deno.test({
  name: "AC-21.7: FIFO order preserved on eviction",
  fn: () => {
    _resetStoreForTests();
    Deno.env.set("FGP_LOGS_BUFFER_NETWORK", "3");
    try {
      const blobId = "aaaaaaaaaaaaaaaa";
      append(blobId, makeNetwork(1));
      append(blobId, makeNetwork(2));
      append(blobId, makeNetwork(3));
      append(blobId, makeNetwork(4));
      const buf = _getNetworkBufferForTests(blobId);
      assertEquals(buf.map((e) => e.ts), [2, 3, 4]);
    } finally {
      Deno.env.delete("FGP_LOGS_BUFFER_NETWORK");
    }
  },
});

Deno.test({
  name: "AC-21.1: network buffer caps at configured size",
  fn: () => {
    _resetStoreForTests();
    Deno.env.set("FGP_LOGS_BUFFER_NETWORK", "50");
    try {
      const blobId = "bbbbbbbbbbbbbbbb";
      for (let i = 1; i <= 60; i++) append(blobId, makeNetwork(i));
      assertEquals(_getNetworkBufferForTests(blobId).length, 50);
    } finally {
      Deno.env.delete("FGP_LOGS_BUFFER_NETWORK");
    }
  },
});

Deno.test({
  name: "AC-21.5: isolation between two blobs",
  fn: () => {
    _resetStoreForTests();
    const a = "aaaa000000000000";
    const b = "bbbb000000000000";
    append(a, makeNetwork(1, "/a"));
    append(b, makeNetwork(2, "/b"));
    const ab = _getNetworkBufferForTests(a);
    const bb = _getNetworkBufferForTests(b);
    assertEquals(ab.length, 1);
    assertEquals(ab[0].path, "/a");
    assertEquals(bb.length, 1);
    assertEquals(bb[0].path, "/b");
  },
});

Deno.test({
  name: "AC-24.1: flushSince filters strictly by ts > since",
  fn: () => {
    _resetStoreForTests();
    const blobId = "cccccccccccccccc";
    append(blobId, makeNetwork(100));
    append(blobId, makeNetwork(200));
    append(blobId, makeNetwork(300));
    append(blobId, makeNetwork(400));
    const filtered = flushSince(blobId, 250);
    assertEquals(filtered.map((e) => e.ts), [300, 400]);
  },
});

Deno.test({
  name: "AC-24.2: flushSince without since returns chronological full buffer",
  fn: () => {
    _resetStoreForTests();
    const blobId = "dddddddddddddddd";
    append(blobId, makeNetwork(200));
    append(blobId, makeNetwork(100));
    append(blobId, makeNetwork(300));
    const all = flushSince(blobId);
    assertEquals(all.map((e) => e.ts), [100, 200, 300]);
  },
});

Deno.test({
  name: "AC-22.1: purge removes inactive blobs",
  fn: () => {
    _resetStoreForTests();
    Deno.env.set("FGP_LOGS_INACTIVITY_MIN", "10");
    try {
      const blobId = "eeeeeeeeeeeeeeee";
      append(blobId, makeNetwork(1));
      _setLastActivityForTests(blobId, Date.now() - 11 * 60_000);
      const removed = purge();
      assertEquals(removed, 1);
      assertEquals(_hasBlobForTests(blobId), false);
    } finally {
      Deno.env.delete("FGP_LOGS_INACTIVITY_MIN");
    }
  },
});

Deno.test({
  name: "AC-22.2: active stream prevents purge",
  fn: () => {
    _resetStoreForTests();
    Deno.env.set("FGP_LOGS_INACTIVITY_MIN", "10");
    try {
      const blobId = "ffffffffffffffff";
      append(blobId, makeNetwork(1));
      const unsub = subscribe(blobId, () => {});
      _setLastActivityForTests(blobId, Date.now() - 20 * 60_000);
      assertEquals(getStreamCount(blobId), 1);
      const removed = purge();
      assertEquals(removed, 0);
      assertEquals(_hasBlobForTests(blobId), true);
      unsub();
    } finally {
      Deno.env.delete("FGP_LOGS_INACTIVITY_MIN");
    }
  },
});

Deno.test({
  name: "AC-23.7: unsubscribe decrements stream count",
  fn: () => {
    _resetStoreForTests();
    const blobId = "1111111111111111";
    append(blobId, makeNetwork(1));
    const unsub = subscribe(blobId, () => {});
    assertEquals(getStreamCount(blobId), 1);
    unsub();
    assertEquals(getStreamCount(blobId), 0);
  },
});

Deno.test({
  name: "AC-23.9: subscribe receives live entries",
  fn: () => {
    _resetStoreForTests();
    const blobId = "2222222222222222";
    const received: LogEntry[] = [];
    const unsub = subscribe(blobId, (e) => {
      received.push(e);
    });
    append(blobId, makeNetwork(1));
    append(blobId, makeNetwork(2));
    assertEquals(received.length, 2);
    unsub();
  },
});

Deno.test({
  name: "Detailed buffer cap independent from network buffer",
  fn: () => {
    _resetStoreForTests();
    Deno.env.set("FGP_LOGS_BUFFER_DETAILED", "3");
    try {
      const blobId = "3333333333333333";
      for (let i = 1; i <= 5; i++) {
        append(blobId, {
          type: "detailed",
          ts: i,
          method: "POST",
          path: "/x",
          truncated: true,
        });
      }
      assertEquals(_getDetailedBufferForTests(blobId).length, 3);
    } finally {
      Deno.env.delete("FGP_LOGS_BUFFER_DETAILED");
    }
  },
});
