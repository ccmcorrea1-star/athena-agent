import { expect } from "vitest";
import { describeEval } from "vitest-evals";
import { createAthenaCodingAgentHarness } from "./athena-harness.ts";

const athenaCodingAgentHarness = createAthenaCodingAgentHarness({ noTools: "all" });

describeEval("Athena Coding Agent smoke", { harness: athenaCodingAgentHarness }, (it) => {
	it("runs a basic prompt end to end", async ({ run }) => {
		const result = await run("What's the capital of France? Respond with only the city name.");

		expect(result.output.trim()).toBe("Paris");
		expect(result.errors).toEqual([]);
		expect(result.usage.provider).toBe(process.env.ATHENA_PROVIDER);
		expect(result.usage.model).toBe(process.env.ATHENA_MODEL);
		expect(result.usage.totalTokens).toBeGreaterThan(0);
	});
});
