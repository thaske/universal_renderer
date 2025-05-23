import { describe, expect, it, vi } from "vitest";
import { adaptMiddleware, type ConnectMiddleware } from "./middlewareAdapter";

describe("adaptMiddleware", () => {
  describe("successful middleware handling", () => {
    it("should adapt Connect middleware that writes directly to response", async () => {
      const middleware: ConnectMiddleware = (req, res, next) => {
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end("Hello World");
      };

      const handler = adaptMiddleware(middleware);
      const request = new Request("http://localhost/test", { method: "GET" });

      const response = await handler(request);
      const text = await response.text();

      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toBe("text/plain");
      expect(text).toBe("Hello World");
    });

    it("should handle middleware that sets headers individually", async () => {
      const middleware: ConnectMiddleware = (req, res, next) => {
        res.setHeader("X-Custom-Header", "test-value");
        res.setHeader("X-Another-Header", "another-value");
        res.statusCode = 201;
        res.end("Created");
      };

      const handler = adaptMiddleware(middleware);
      const request = new Request("http://localhost/test", { method: "POST" });

      const response = await handler(request);
      const text = await response.text();

      expect(response.status).toBe(201);
      expect(response.headers.get("X-Custom-Header")).toBe("test-value");
      expect(response.headers.get("X-Another-Header")).toBe("another-value");
      expect(text).toBe("Created");
    });

    it("should handle streaming middleware", async () => {
      const middleware: ConnectMiddleware = (req, res, next) => {
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.write("First chunk");
        setTimeout(() => {
          res.write(" Second chunk");
          res.end(" Final chunk");
        }, 10);
      };

      const handler = adaptMiddleware(middleware);
      const request = new Request("http://localhost/stream", { method: "GET" });

      const response = await handler(request);
      const text = await response.text();

      expect(response.status).toBe(200);
      expect(text).toBe("First chunk Second chunk Final chunk");
    });
  });

  describe("request object compatibility", () => {
    it("should provide correct request properties to middleware", async () => {
      let capturedReq: any;

      const middleware: ConnectMiddleware = (req, res, next) => {
        capturedReq = req;
        res.end("ok");
      };

      const handler = adaptMiddleware(middleware);
      const request = new Request(
        "http://localhost:3000/test/path?query=value",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Custom": "header-value",
          },
        },
      );

      await handler(request);

      expect(capturedReq.method).toBe("POST");
      expect(capturedReq.url).toBe("/test/path?query=value");
      expect(capturedReq.headers["content-type"]).toBe("application/json");
      expect(capturedReq.headers["x-custom"]).toBe("header-value");
      expect(capturedReq.httpVersion).toBe("1.1");
    });

    it("should handle request body streaming", async () => {
      let receivedBody = "";

      const middleware: ConnectMiddleware = (req, res, next) => {
        req.on("data", (chunk: Buffer) => {
          receivedBody += chunk.toString();
        });
        req.on("end", () => {
          res.end(`Received: ${receivedBody}`);
        });
      };

      const handler = adaptMiddleware(middleware);
      const request = new Request("http://localhost/test", {
        method: "POST",
        body: "test body data",
      });

      const response = await handler(request);
      const text = await response.text();

      expect(text).toBe("Received: test body data");
    });
  });

  describe("response object compatibility", () => {
    it("should support writeHead method", async () => {
      const middleware: ConnectMiddleware = (req, res, next) => {
        res.writeHead(302, {
          Location: "https://example.com",
          "Set-Cookie": "test=value",
        });
        res.end();
      };

      const handler = adaptMiddleware(middleware);
      const request = new Request("http://localhost/redirect", {
        method: "GET",
      });

      const response = await handler(request);

      expect(response.status).toBe(302);
      expect(response.headers.get("Location")).toBe("https://example.com");
      expect(response.headers.get("Set-Cookie")).toBe("test=value");
    });

    it("should support header manipulation methods", async () => {
      const middleware: ConnectMiddleware = (req, res, next) => {
        res.setHeader("X-Test", "initial");
        expect(res.getHeader("X-Test")).toBe("initial");

        res.setHeader("X-Test", "updated");
        expect(res.getHeader("X-Test")).toBe("updated");

        res.removeHeader("X-Test");
        expect(res.getHeader("X-Test")).toBeUndefined();

        res.setHeader("X-Final", "final-value");
        res.end("ok");
      };

      const handler = adaptMiddleware(middleware);
      const request = new Request("http://localhost/headers", {
        method: "GET",
      });

      const response = await handler(request);

      expect(response.headers.get("X-Test")).toBeNull();
      expect(response.headers.get("X-Final")).toBe("final-value");
    });

    it("should handle flushHeaders call", async () => {
      const middleware: ConnectMiddleware = (req, res, next) => {
        res.setHeader("X-Early", "header");
        res.flushHeaders(); // Should not throw
        res.end("content");
      };

      const handler = adaptMiddleware(middleware);
      const request = new Request("http://localhost/flush", { method: "GET" });

      const response = await handler(request);

      expect(response.status).toBe(200);
      expect(response.headers.get("X-Early")).toBe("header");
    });
  });

  describe("next() function behavior", () => {
    it("should return 404 when middleware calls next() without error", async () => {
      const middleware: ConnectMiddleware = (req, res, next) => {
        // Middleware doesn't handle this request
        next();
      };

      const handler = adaptMiddleware(middleware);
      const request = new Request("http://localhost/unhandled", {
        method: "GET",
      });

      const response = await handler(request);
      const text = await response.text();

      expect(response.status).toBe(404);
      expect(text).toBe("Not Found");
    });

    it("should return 500 when middleware calls next() with error", async () => {
      const middleware: ConnectMiddleware = (req, res, next) => {
        next(new Error("Something went wrong"));
      };

      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      const handler = adaptMiddleware(middleware);
      const request = new Request("http://localhost/error", { method: "GET" });

      const response = await handler(request);
      const text = await response.text();

      expect(response.status).toBe(500);
      expect(text).toBe("Internal Server Error");
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "[Middleware] error",
        expect.any(Error),
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe("error handling", () => {
    it("should handle synchronous middleware errors", async () => {
      const middleware: ConnectMiddleware = (req, res, next) => {
        throw new Error("Synchronous error");
      };

      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      const handler = adaptMiddleware(middleware);
      const request = new Request("http://localhost/sync-error", {
        method: "GET",
      });

      await expect(handler(request)).rejects.toThrow("Synchronous error");
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "[Middleware] threw synchronously",
        expect.any(Error),
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe("edge cases", () => {
    it("should handle empty response", async () => {
      const middleware: ConnectMiddleware = (req, res, next) => {
        res.end();
      };

      const handler = adaptMiddleware(middleware);
      const request = new Request("http://localhost/empty", { method: "GET" });

      const response = await handler(request);
      const text = await response.text();

      expect(response.status).toBe(200);
      expect(text).toBe("");
    });

    it("should handle multiple write calls before end", async () => {
      const middleware: ConnectMiddleware = (req, res, next) => {
        res.write("Part 1");
        res.write("Part 2");
        res.write("Part 3");
        res.end();
      };

      const handler = adaptMiddleware(middleware);
      const request = new Request("http://localhost/multi-write", {
        method: "GET",
      });

      const response = await handler(request);
      const text = await response.text();

      expect(text).toBe("Part 1Part 2Part 3");
    });

    it("should handle end() with content in one call", async () => {
      const middleware: ConnectMiddleware = (req, res, next) => {
        res.end("Complete response in end call");
      };

      const handler = adaptMiddleware(middleware);
      const request = new Request("http://localhost/end-with-content", {
        method: "GET",
      });

      const response = await handler(request);
      const text = await response.text();

      expect(text).toBe("Complete response in end call");
    });
  });
});
