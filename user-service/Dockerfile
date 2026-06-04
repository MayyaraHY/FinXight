# ─────────────────────────────────────────────────────────────────────
# user-service — Spring Boot 4 (Java 17) user management microservice
# Multi-stage: Maven build → slim JRE runtime.
# ─────────────────────────────────────────────────────────────────────

# ---- Stage 1: build the fat jar ----
FROM maven:3.9-eclipse-temurin-17 AS build
WORKDIR /build

# Cache dependencies: resolve them before copying source so a code-only
# change doesn't re-download the whole Maven repo.
COPY pom.xml .
RUN mvn -B -q dependency:go-offline

COPY src ./src
# Tests use Testcontainers (need a Docker daemon) — skip them in the image build.
RUN mvn -B -q clean package -DskipTests

# ---- Stage 2: runtime ----
FROM eclipse-temurin:17-jre-alpine AS runtime
WORKDIR /app

# wget (busybox) is used by the compose healthcheck.
COPY --from=build /build/target/user-service-0.0.1-SNAPSHOT.jar app.jar

EXPOSE 8080

ENTRYPOINT ["java", "-jar", "app.jar"]
