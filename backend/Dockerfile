# syntax=docker/dockerfile:1
# Build: JDK 25 + Maven Wrapper. Run: JRE 25 only, non-root.
FROM eclipse-temurin:25-jdk AS build
WORKDIR /app
COPY .mvn/ .mvn/
COPY mvnw pom.xml ./
RUN chmod +x mvnw && ./mvnw -q -B dependency:go-offline
COPY src/ src/
# tests and Checkstyle run in CI (./mvnw verify); the image build only packages the jar
RUN ./mvnw -q -B package -DskipTests -Dcheckstyle.skip

FROM eclipse-temurin:25-jre
WORKDIR /app
RUN useradd --system --uid 10001 app
COPY --from=build /app/target/purchase-requests-*.jar app.jar
USER app
EXPOSE 3000
# Flyway migrations and the demo seed run on startup — no manual step (README §5.3)
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75", "-jar", "/app/app.jar"]
