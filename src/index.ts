import { Agent, AgentNamespace, routeAgentRequest, getAgentByName } from 'agents';
import { Hono } from 'hono';
import { WorkflowEntrypoint, WorkflowStep, WorkflowEvent } from 'cloudflare:workers';

interface Env {
  WorkflowAgent: AgentNamespace<WorkflowAgent>;
  DEMO_WORKFLOW: Workflow;
}

type WorkflowParams = {
  user: string;
  task: string;
};

export class DemoWorkflow extends WorkflowEntrypoint<Env, WorkflowParams> {
  async run(event: WorkflowEvent<WorkflowParams>, step: WorkflowStep) {
    // Step 1: Log the start
    const started = await step.do('start', async () => {
      return { startedBy: event.payload.user, task: event.payload.task };
    });

    // Step 2: Simulate a task (sleep)
    await step.sleep('wait', '10 seconds');

    // Step 3: Complete
    const completed = await step.do('complete', async () => {
      return { status: 'done', finishedBy: event.payload.user };
    });

    return { started, completed };
  }
}

export class WorkflowAgent extends Agent<Env> {
  // Start a workflow instance
  async onRequest(request: Request) {
    const url = new URL(request.url);
    if (url.pathname === '/start-workflow' && request.method === 'POST') {
      const { user, task } = await request.json();
      const instance = await this.env.DEMO_WORKFLOW.create({
        id: crypto.randomUUID(),
        params: { user, task },
      });
      return Response.json({ instanceId: instance.id, status: await instance.status() });
    }
    if (url.pathname === '/workflow-status' && request.method === 'GET') {
      const id = url.searchParams.get('id');
      if (!id) return Response.json({ error: 'Missing id' }, { status: 400 });
      const instance = await this.env.DEMO_WORKFLOW.get(id);
      return Response.json({ status: await instance.status() });
    }
    return Response.json({ error: 'Not found' }, { status: 404 });
  }
}

const app = new Hono<{ Bindings: Env }>();

app.post('/start-workflow', async (c) => {
  // Proxy to the agent
  const agent = await getAgentByName<Env, WorkflowAgent>(c.env.WorkflowAgent, 'workflow-agent');
  return agent.fetch(c.req.raw);
});

app.get('/workflow-status', async (c) => {
  const agent = await getAgentByName<Env, WorkflowAgent>(c.env.WorkflowAgent, 'workflow-agent');
  return agent.fetch(c.req.raw);
});

export default {
  fetch: app.fetch,
};
