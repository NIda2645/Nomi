import { describe, expect, it, vi } from "vitest";
import { LocalTaskJobs, withTaskOwner } from "./localTaskJobs";
describe("owned local task jobs", () => {
  it("imports once, only into the bound project and owner", async () => {
    const jobs = new LocalTaskJobs<string>(); const write = vi.fn(() => ["nomi-local://result"]);
    const id = withTaskOwner(1, () => jobs.start("project", async () => "pixels"));
    await jobs.settled(id);
    expect(() => withTaskOwner(2, () => jobs.query(id, "project", write))).toThrow("OWNER_MISMATCH");
    expect(() => withTaskOwner(1, () => jobs.query(id, "other", write))).toThrow("PROJECT_MISMATCH");
    expect(withTaskOwner(1, () => jobs.query(id, "project", write)).status).toBe("succeeded");
    withTaskOwner(1, () => jobs.query(id, "project", write));
    expect(write).toHaveBeenCalledExactlyOnceWith("pixels");
  });
  it("cancel waits for cleanup and prevents late output/import", async () => {
    const jobs = new LocalTaskJobs<string>(); let finish!: (value: string) => void;
    const id = withTaskOwner(1, () => jobs.start("p", () => new Promise<string>((resolve) => { finish = resolve; })));
    const cancel = jobs.cancel(id, 1); let settled = false; void cancel.then(() => { settled = true; });
    await Promise.resolve(); expect(settled).toBe(false);
    finish("late pixels"); await cancel;
    const write = vi.fn();
    expect(withTaskOwner(1, () => jobs.query(id, "p", write)).status).toBe("cancelled");
    expect(write).not.toHaveBeenCalled();
  });
  it("window destruction aborts only its owned jobs", async () => {
    const jobs = new LocalTaskJobs<string>();
    const work = (signal: AbortSignal) => new Promise<string>((_, reject) => signal.addEventListener("abort", () => reject(new Error("stopped"))));
    const a = withTaskOwner(1, () => jobs.start("p", work));
    const b = withTaskOwner(2, () => jobs.start("p", work));
    await expect(jobs.cancel(b, 1)).rejects.toThrow("OWNER_MISMATCH");
    await jobs.cancelOwner(1);
    expect(withTaskOwner(1, () => jobs.query(a, "p", vi.fn())).status).toBe("cancelled");
    expect(withTaskOwner(2, () => jobs.query(b, "p", vi.fn())).status).toBe("running");
    await jobs.cancelOwner(2);
  });
  it("does not start paid work when the external signal is already cancelled", () => {
    const jobs = new LocalTaskJobs<string>(); const work = vi.fn(async () => "pixels");
    expect(() => jobs.start("p", work, AbortSignal.abort())).toThrow("LOCAL_TASK_CANCELLED");
    expect(work).not.toHaveBeenCalled();
  });
  it("closing an owner prevents late work after asynchronous submission setup", async () => {
    const jobs = new LocalTaskJobs<string>(); const work = vi.fn(async () => "pixels");
    await jobs.cancelOwner(1);
    expect(() => withTaskOwner(1, () => jobs.start("p", work))).toThrow("LOCAL_TASK_OWNER_CLOSED");
    expect(work).not.toHaveBeenCalled();
  });
  it("application shutdown closes submission before draining in-flight work", async () => {
    const jobs = new LocalTaskJobs<string>(); let finish!: (value: string) => void;
    const id = jobs.start("p", () => new Promise<string>((resolve) => { finish = resolve; }));
    const shutdown = jobs.cancelAll(); const work = vi.fn(async () => "late");
    expect(() => jobs.start("p", work)).toThrow("LOCAL_TASK_SHUTTING_DOWN");
    finish("pixels"); await shutdown;
    expect(jobs.query(id, "p", vi.fn()).status).toBe("cancelled");
    expect(work).not.toHaveBeenCalled();
  });
  it("cancelling finished work before import drops the result without writing an asset", async () => {
    const jobs = new LocalTaskJobs<string>(); const write = vi.fn();
    const id = jobs.start("p", async () => "pixels"); await jobs.settled(id);
    await expect(jobs.cancel(id)).resolves.toEqual({ ok: true });
    expect(jobs.query(id, "p", write)).toMatchObject({ status: "cancelled", image_urls: [] });
    expect(write).not.toHaveBeenCalled();
  });
  it("does not erase an already imported result on cancellation", async () => {
    const jobs = new LocalTaskJobs<string>(); const write = vi.fn(() => ["nomi-local://result"]);
    const id = jobs.start("p", async () => "pixels"); await jobs.settled(id);
    jobs.query(id, "p", write);
    await expect(jobs.cancel(id)).resolves.toEqual({ ok: false });
    expect(jobs.query(id, "p", write)).toMatchObject({ status: "succeeded", image_urls: ["nomi-local://result"] });
    expect(write).toHaveBeenCalledOnce();
  });
  it("retains output after a failed idempotent import so polling can recover", async () => {
    const jobs = new LocalTaskJobs<string>();
    const write = vi.fn<(_: string) => string[]>()
      .mockImplementationOnce(() => { throw new Error("disk unavailable"); })
      .mockReturnValue(["nomi-local://result"]);
    const id = jobs.start("p", async () => "pixels"); await jobs.settled(id);
    expect(() => jobs.query(id, "p", write)).toThrow("disk unavailable");
    expect(jobs.query(id, "p", write)).toMatchObject({ status: "succeeded", image_urls: ["nomi-local://result"] });
    jobs.query(id, "p", write);
    expect(write.mock.calls).toEqual([["pixels"], ["pixels"]]);
  });
});
