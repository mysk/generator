import { HttpException, HttpStatus, Injectable, Logger } from "@nestjs/common";
import { buildContext } from "./builders/context";
import { getGenerator } from "./generators.registry";
import { GeneratorError, InvocationForm } from "./types";

@Injectable()
export class GeneratorsService {
  private readonly logger = new Logger(GeneratorsService.name);

  async invoke(key: string, form: InvocationForm) {
    const generator = getGenerator(key);
    if (!generator) {
      throw new HttpException(
        [
          {
            code: "GENERATOR_NOT_FOUND",
            message: `Could not find generator with key: ${key}`,
          } satisfies GeneratorError,
        ],
        HttpStatus.CONFLICT,
      );
    }

    if (!form?.service) {
      throw new HttpException(
        [
          {
            code: "SERVICE_PAYLOAD_NOT_FOUND",
            message: `Service json not found for key[${key}]. Expected body of request to be a service spec json file produced by https://app.apibuilder.io.`,
          } satisfies GeneratorError,
        ],
        HttpStatus.CONFLICT,
      );
    }

    this.logger.log({
      message: "Generating code",
      generatorKey: key,
      service: `${form.service.namespace}.${form.service.name ?? form.service.application?.key}`,
      importedServices: (form.imported_services ?? []).map(
        (service) => service.name ?? service.application?.key ?? service.namespace,
      ),
    });

    const context = buildContext(form);
    if (context.unresolvedTypes.length > 0) {
      this.logger.warn({
        message: "Unresolved types in invocation form",
        generatorKey: key,
        unresolvedTypeCount: context.unresolvedTypes.length,
        unresolvedTypes: context.unresolvedTypes,
      });
    }

    try {
      const files = await generator.generate(form);
      this.logger.log({ message: "Generation complete", generatorKey: key, fileCount: files.length });
      return { files, source: "" };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;
      this.logger.error({ message: "Generation failed", generatorKey: key, error: message, stack });
      throw new HttpException(
        [
          {
            code: "GENERATOR_ERROR",
            message: `Error in generator ${key}: ${message}${stack ? `\n${stack}` : ""}`,
          } satisfies GeneratorError,
        ],
        HttpStatus.CONFLICT,
      );
    }
  }
}
