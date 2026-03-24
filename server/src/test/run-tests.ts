import assert from "node:assert/strict";
import {
  MAX_PROFILE_NAME_LENGTH,
  validateProfileUpdatePayload
} from "../api/profile.validation.ts";
import { formatWorkspaceDisplayName } from "../services/workspace.naming.ts";

const tests: Array<{ name: string; run: () => void }> = [
  {
    name: "profile validation normalizes valid input",
    run: () => {
      const result = validateProfileUpdatePayload({
        name: "  Casey  ",
        image: "https://example.com/avatar.png"
      });
      assert.equal(result.ok, true);
      if (result.ok) {
        assert.deepEqual(result.data, {
          name: "Casey",
          image: "https://example.com/avatar.png"
        });
      }
    }
  },
  {
    name: "profile validation rejects empty names",
    run: () => {
      const result = validateProfileUpdatePayload({ name: "   " });
      assert.equal(result.ok, false);
    }
  },
  {
    name: "profile validation rejects overlong names",
    run: () => {
      const result = validateProfileUpdatePayload({
        name: "x".repeat(MAX_PROFILE_NAME_LENGTH + 1)
      });
      assert.equal(result.ok, false);
    }
  },
  {
    name: "profile validation converts blank image strings to null",
    run: () => {
      const result = validateProfileUpdatePayload({
        name: "Taylor",
        image: "   "
      });
      assert.equal(result.ok, true);
      if (result.ok) {
        assert.equal(result.data.image, null);
      }
    }
  },
  {
    name: "workspace display name fallback formats ids",
    run: () => {
      assert.equal(formatWorkspaceDisplayName("default"), "Shared workspace");
      assert.equal(formatWorkspaceDisplayName("team-alpha"), "Team Alpha");
      assert.equal(
        formatWorkspaceDisplayName("client_success_ops"),
        "Client Success Ops"
      );
    }
  }
];

let failed = false;

for (const testCase of tests) {
  try {
    testCase.run();
    console.log(`PASS ${testCase.name}`);
  } catch (error) {
    failed = true;
    console.error(`FAIL ${testCase.name}`);
    console.error(error);
  }
}

if (failed) {
  process.exitCode = 1;
}
