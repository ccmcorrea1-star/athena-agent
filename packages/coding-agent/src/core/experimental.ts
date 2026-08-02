export function areExperimentalFeaturesEnabled(): boolean {
	return process.env.ATHENA_EXPERIMENTAL === "1";
}
