import { spawn } from "child_process";
import { prisma } from "./prisma";
import os from "os";

export interface Job {
  id: string; // unique identifier (e.g. `pipeline_${runId}`)
  type: "pipeline" | "db_sync" | "api_sync" | "bronze_ingest";
  runId?: number;
  sourceId?: number;
  args: string[];
  scriptPath?: string;
  inlineScript?: string;
  onStart?: () => Promise<void> | void;
  onComplete?: (code: number | null, stdout: string, stderr: string) => Promise<void> | void;
  onError?: (err: Error) => Promise<void> | void;
}

let startupCleanupDone = false;

async function performStartupCleanup() {
  if (startupCleanupDone) return;
  startupCleanupDone = true;
  console.log("[JobQueue] Running startup cleanup to clear stuck jobs...");
  try {
    // 1. Fail any pipeline runs stuck in PENDING or RUNNING
    const failedRuns = await prisma.pipelineRun.updateMany({
      where: {
        status: { in: ["PENDING", "RUNNING"] },
      },
      data: {
        status: "FAILED",
        finishedAt: new Date(),
        errorMessage: "Pipeline run was aborted due to server restart or crash.",
      },
    });
    if (failedRuns.count > 0) {
      console.log(`[JobQueue] Cleaned up ${failedRuns.count} stuck pipeline runs.`);
    }

    // 2. Mark any data sources stuck in SYNCING as ERROR
    const failedSources = await prisma.dataSource.updateMany({
      where: {
        status: "SYNCING",
      },
      data: {
        status: "ERROR",
      },
    });

    if (failedSources.count > 0) {
      console.log(`[JobQueue] Cleaned up ${failedSources.count} stuck syncing data sources.`);
    }
  } catch (error: any) {
    console.error("[JobQueue] Error during startup cleanup:", error.message);
  }
}

class JobQueue {
  private queue: Job[] = [];
  private activeCount = 0;
  private maxConcurrency = 2; // Controlled concurrency limit
  private initialized = false;

  constructor() {
    this.init();
  }

  private async init() {
    await performStartupCleanup();
    this.initialized = true;
    this.processNext();
  }

  public enqueue(job: Job) {
    console.log(`[JobQueue] Enqueueing job: ${job.id} (Type: ${job.type})`);
    this.queue.push(job);
    this.processNext();
  }

  private getPythonExecutable(): string {
    if (process.env.PYTHON_PATH) {
      return process.env.PYTHON_PATH.replace(/"/g, "").replace(/'/g, ""); // sanitize quotes if any
    }
    return os.platform() === "win32" ? "python" : "python3";
  }

  private async processNext() {
    if (!this.initialized) return;
    if (this.activeCount >= this.maxConcurrency) {
      console.log(`[JobQueue] Max concurrency reached (${this.activeCount}/${this.maxConcurrency}). Job remains in queue.`);
      return;
    }
    if (this.queue.length === 0) return;

    const job = this.queue.shift();
    if (!job) return;

    this.activeCount++;
    console.log(`[JobQueue] Starting job: ${job.id}. Active jobs: ${this.activeCount}/${this.maxConcurrency}`);

    try {
      if (job.onStart) {
        await job.onStart();
      }

      const pythonExe = this.getPythonExecutable();
      let spawnArgs: string[] = [];

      if (job.type === "bronze_ingest" && job.inlineScript) {
        spawnArgs = ["-c", job.inlineScript];
      } else if (job.scriptPath) {
        spawnArgs = [job.scriptPath, ...job.args];
      } else {
        throw new Error("Invalid job configuration: missing script details.");
      }

      const safeArgsLog = spawnArgs.map(a => a.length > 150 ? a.substring(0, 150) + "..." : a).join(" ");
      console.log(`[JobQueue] Spawning: ${pythonExe} ${safeArgsLog}`);
      
      const proc = spawn(pythonExe, spawnArgs, {
        env: { ...process.env },
        cwd: process.cwd(),
        timeout: 300000, // 5 minutes timeout
      });

      let stdout = "";
      let stderr = "";

      proc.stdout.on("data", (data: Buffer) => { stdout += data.toString(); });
      proc.stderr.on("data", (data: Buffer) => { stderr += data.toString(); });

      proc.on("close", async (code: number | null) => {
        console.log(`[JobQueue] Job completed: ${job.id} with exit code ${code}`);
        this.activeCount--;
        
        try {
          if (job.onComplete) {
            await job.onComplete(code, stdout, stderr);
          }
        } catch (e: any) {
          console.error(`[JobQueue] Error in onComplete for job ${job.id}:`, e);
        }

        this.processNext();
      });

      proc.on("error", async (err) => {
        console.error(`[JobQueue] Spawn error for job ${job.id}:`, err.message);
        this.activeCount--;

        try {
          if (job.onError) {
            await job.onError(err);
          }
        } catch (e: any) {
          console.error(`[JobQueue] Error in onError callback for job ${job.id}:`, e);
        }

        this.processNext();
      });

    } catch (err: any) {
      console.error(`[JobQueue] Error setting up job ${job.id}:`, err.message);
      this.activeCount--;
      
      try {
        if (job.onError) {
          await job.onError(err);
        }
      } catch (e: any) {
        console.error(`[JobQueue] Error in onError fallback for job ${job.id}:`, e);
      }

      this.processNext();
    }
  }
}

const globalForQueue = globalThis as unknown as { jobQueueInstance: JobQueue | null };

if (!globalForQueue.jobQueueInstance) {
  globalForQueue.jobQueueInstance = new JobQueue();
}

export const jobQueue = globalForQueue.jobQueueInstance;
