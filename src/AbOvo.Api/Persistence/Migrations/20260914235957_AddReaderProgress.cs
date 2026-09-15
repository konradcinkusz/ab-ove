using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AbOvo.Api.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddReaderProgress : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "ReaderProgress",
                columns: table => new
                {
                    Subject = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    Track = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    Unit = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    Step = table.Column<int>(type: "integer", nullable: false),
                    Language = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ReaderProgress", x => new { x.Subject, x.Track, x.Unit });
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ReaderProgress");
        }
    }
}
