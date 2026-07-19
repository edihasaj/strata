import { loadConfig } from '$lib/config';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const config = await loadConfig();
	return { config };
};
