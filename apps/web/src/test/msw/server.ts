import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";

export const server = setupServer();

export { http, HttpResponse };
