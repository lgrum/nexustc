import { config } from "dotenv";

process.env.SKIP_ENV_VALIDATION = "1";

// Load environment variables for testing
config();
