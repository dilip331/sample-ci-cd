import { ConnectClient, GetContactMetricsCommand } from "@aws-sdk/client-connect";

const client = new ConnectClient({});

export const handler = async (event) => {
  try {
    console.log("Received Event:", JSON.stringify(event, null, 2));

    const contactId = event?.Details?.ContactData?.ContactId;
    const instanceArn = event?.Details?.ContactData?.InstanceARN;
    const action = event?.Details?.Parameters?.action;

    if (!contactId || !instanceArn) {
      throw new Error("Missing ContactId or InstanceARN from Connect event");
    }

    if (!action) {
      throw new Error("Missing action parameter");
    }

    // Extract InstanceId from ARN
    const instanceId = instanceArn.split("/")[1];

    console.log("InstanceId:", instanceId);
    console.log("ContactId:", contactId);
    console.log("Action:", action);
    
    let metricName;
    if (action === "getPositionInQueue") {
      metricName = "POSITION_IN_QUEUE";
    } else if (action === "getEWT") {
      metricName = "ESTIMATED_WAIT_TIME";
    } else {
      throw new Error(`Invalid action: ${action}. Expected 'getPositionInQueue' or 'getEWT'`);
    }

    const command = new GetContactMetricsCommand({
      InstanceId: instanceId,
      ContactId: contactId,
      Metrics: [
        {
          Name: metricName,
        },
      ],
    });

    const response = await client.send(command);

    console.log("Connect Response:", JSON.stringify(response, null, 2));

    let metricValue = 0;

    if (response?.MetricResults?.length) {
      const metric = response.MetricResults.find(
        (m) => m.Name === metricName
      );
      metricValue = metric?.Value?.Number ?? 0;
    }

    console.log(`${metricName}:`, metricValue);

    // Return response based on action
    if (action === "getPositionInQueue") {
      return {
        positionInQueue: metricValue
      };
    } else if (action === "getEWT"){
      return {
        estimatedWaitTime: metricValue // in seconds
      };
    }
    else {
      throw new Error(`Invalid action: ${action}. Expected 'getPositionInQueue' or 'getEWT'`);
    }

  } catch (error) {
    console.error("Error:", error);
    return {
      positionInQueue: 0,
      estimatedWaitTime: 0,
      error: error.message
    };
  }
};