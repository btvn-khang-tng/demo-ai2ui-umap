import "dotenv/config";
import express from "express";
import { copilotRuntimeNodeExpressEndpoint } from "@copilotkit/runtime";
import { runtime } from "./llm.js";
import { dataRouter } from "./routes/data.js";
import { loadDataset } from "./data/load.js";

const app = express();

// CopilotKit FIRST, mounted on a path, with endpoint: "/".
// ⚠️ Express strips the mount prefix and the handler reads req.url post-strip.
//    Passing endpoint: "/api/copilotkit" here yields a bare 404.
app.use("/api/copilotkit", copilotRuntimeNodeExpressEndpoint({ runtime, endpoint: "/" }));

// ⚠️ express.json() AFTER the CopilotKit handler — the runtime reads the raw stream.
app.use(express.json({ limit: "2mb" }));
app.use("/api", dataRouter);

loadDataset(); // fail fast at boot, not on first request
app.listen(3001, () => console.log("http://localhost:3001"));
