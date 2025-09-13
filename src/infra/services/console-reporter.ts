import { AgentReporter } from '@/core/interfaces/agent-reporter.interface';

export class ConsoleReporter implements AgentReporter {
  constructor(private readonly name: string) {}

  getSpinner() {}

  success(message: string): void {
    console.log(`[${this.name}] [SUCCESS] ${message}`);
  }

  failure(message: string): void {
    console.log(`[${this.name}] [FAILED] ${message}`);
  }

  loading(message: string): void {
    console.log(`[${this.name}] [LOADING] ${message}`);
  }

  info(message: string): void {
    console.log(`[${this.name}] [INFO] ${message}`);
  }

  log(message: string): void {
    console.log(`[${this.name}] ${message}`);
  }
}
